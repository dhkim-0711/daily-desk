import test from "node:test";
import assert from "node:assert/strict";
import { scoreArticle } from "../server.js";

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
