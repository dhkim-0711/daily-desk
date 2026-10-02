import test from "node:test";
import assert from "node:assert/strict";
import { prepareNewsCandidates, scoreArticle } from "../server.js";

// Importing the scoring function uses the existing direct-start guard: no server or feeds.
const article = (title, summary = "") => ({ title, summary });

test("NVIDIA case variants and Korean spelling count as one company", () => {
  const single = scoreArticle(article("NVIDIA AI inference"));
  const aliases = scoreArticle(article("NVIDIA Nvidia 엔비디아 AI inference", "Nvidia 엔비디아"));

  assert.equal(single.score, 15);
  assert.deepEqual(aliases, single);
  assert.deepEqual(single.companyHits, ["NVIDIA"]);
});

test("Google parent, products, and Korean aliases share one company weight", () => {
  const single = scoreArticle(article("Google AI inference"));
  const aliases = scoreArticle(article("Google Alphabet Gemini DeepMind TPU 구글 알파벳 제미나이 딥마인드 AI inference"));

  assert.equal(single.score, 15);
  assert.deepEqual(aliases, single);
  assert.deepEqual(single.companyHits, ["Google"]);
});

test("domestic NPU companies do not gain weight from bilingual or overlapping aliases", () => {
  const groups = [
    ["리벨리온", "리벨리온 Rebellions"],
    ["퓨리오사AI", "퓨리오사AI 퓨리오사 FuriosaAI Furiosa"],
    ["하이퍼엑셀", "하이퍼엑셀 HyperAccel"],
    ["딥엑스", "딥엑스 DEEPX"],
    ["모빌린트", "모빌린트 Mobilint"],
  ];
  for (const [company, aliases] of groups) {
    const single = scoreArticle(article(`${company} NPU inference`));
    const combined = scoreArticle(article(`${aliases} NPU inference`));
    assert.equal(single.score, 18, company);
    assert.deepEqual(combined, single, company);
    assert.deepEqual(combined.companyHits, [company]);
    assert.equal(combined.issueCategory, "NPU");
  }
});

test("a second distinct company still contributes its own weight", () => {
  const one = scoreArticle(article("NVIDIA AI inference"));
  const two = scoreArticle(article("NVIDIA Nvidia 엔비디아 AMD AI inference"));

  assert.equal(two.score - one.score, 4);
  assert.deepEqual(two.companyHits, ["NVIDIA", "AMD"]);
  assert.deepEqual(two.taxonomyHits, one.taxonomyHits);
});

test("domestic policy bonus and policy classification remain intact", () => {
  const baseline = scoreArticle(article("AI반도체 정책"));
  for (const agency of ["NIPA", "정보통신산업진흥원", "과기정통부", "과학기술정보통신부", "IITP", "정보통신기획평가원"]) {
    const policy = scoreArticle(article(`${agency} AI반도체 정책`));
    assert.equal(policy.score - baseline.score, 10, agency);
    assert.deepEqual(policy.taxonomyHits, baseline.taxonomyHits);
    assert.equal(policy.issueCategory, "정책", agency);
  }
});

test("topic tags and recency continue contributing independently of company aliases", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-09-29T00:00:00Z"));
  const undated = scoreArticle(article("Google AI inference"));
  const today = scoreArticle({ ...article("Google Alphabet Gemini TPU AI inference"), publishedAt: "2026-09-29T00:00:00Z" });
  const yesterday = scoreArticle({ ...article("Google AI inference"), publishedAt: "2026-09-28T00:00:00Z" });
  const old = scoreArticle({ ...article("Google AI inference"), publishedAt: "2026-09-19T00:00:00Z" });

  assert.deepEqual(today.taxonomyHits, ["추론", "Google"]);
  assert.equal(today.issueCategory, "추론");
  assert.equal(today.score, undated.score + 8);
  assert.equal(yesterday.score, undated.score + 7);
  assert.equal(old.score, undated.score);
});

const globalCandidates = (count) => Array.from({ length: count }, (_, index) => ({
  ...article(`NVIDIA AI inference report ${index}`),
  sourceIds: ["global-ai-chips"],
}));

test("low-scoring government and regional discoveries survive collection and receive body retrieval", () => {
  const sourceIds = ["government-npu-policy", "local-government-npu", "regional-npu-budget", "public-regional-npu-demand"];
  const publicCandidates = sourceIds.map((id, index) => ({
    ...article(`지역 국비 확보 현안 ${index}`),
    sourceIds: [id],
  }));
  const plan = prepareNewsCandidates([...globalCandidates(200), ...publicCandidates]);

  assert.equal(plan.articles.length, 180);
  assert.equal(new Set(plan.articles.map((item) => item.title)).size, 180);
  for (const candidate of publicCandidates) {
    const retained = plan.articles.find((item) => item.title === candidate.title);
    assert.ok(retained);
    assert.equal(retained.score, scoreArticle(candidate).score, "candidate priority does not add score");
    assert.ok(plan.enrichmentOrder.slice(0, 80).some((item) => item.title === candidate.title));
  }
  assert.ok(plan.articles.every((item, index, all) => index === 0 || all[index - 1].score >= item.score));
});

test("collection reservation stops at 24 and the remaining positions follow existing scores", () => {
  const publicCandidates = Array.from({ length: 30 }, (_, index) => ({
    ...article(`지방 국비 요청 ${index}`),
    sourceIds: ["regional-npu-budget"],
  }));
  const plan = prepareNewsCandidates([...globalCandidates(200), ...publicCandidates]);

  assert.equal(plan.articles.length, 180);
  assert.equal(plan.articles.filter((item) => item.sourceIds.includes("regional-npu-budget")).length, 24);
  assert.deepEqual(plan.enrichmentOrder.slice(0, 24).map((item) => item.title), publicCandidates.slice(0, 24).map((item) => item.title));
  assert.deepEqual(plan.enrichmentOrder.slice(24).map((item) => item.title), globalCandidates(156).map((item) => item.title));
});

test("deduplication retains later public-search provenance without mutating inputs", () => {
  const first = { ...article("지역 산업 예산 현안"), source: "기존 검색", sourceIds: ["korea-ai-policy"] };
  const later = { ...first, source: "지역 NPU 국비·실증", sourceIds: ["regional-npu-budget"] };
  const inputs = [...globalCandidates(200), first, later, later];
  const before = JSON.stringify(inputs);
  const plan = prepareNewsCandidates(inputs);
  const matches = plan.articles.filter((item) => item.title === first.title);

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].sourceIds, ["korea-ai-policy", "regional-npu-budget"]);
  assert.equal(plan.enrichmentOrder[0].title, first.title);
  assert.equal(matches[0].source, first.source);
  assert.equal(JSON.stringify(inputs), before);
});

test("without public-search candidates collection and retrieval retain the normal score order", () => {
  const candidates = [article("낮은 관련성 기사"), ...globalCandidates(200)];
  const plan = prepareNewsCandidates(candidates);

  assert.equal(plan.articles.length, 180);
  assert.deepEqual(plan.articles, plan.enrichmentOrder);
  assert.deepEqual(plan.articles.map((item) => item.title), globalCandidates(180).map((item) => item.title));
  assert.deepEqual(prepareNewsCandidates([]), { articles: [], enrichmentOrder: [] });
});
