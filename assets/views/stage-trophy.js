// 트로피 그림 — 시상식(ceremony.js)과 현황판 수상 축하(stage.js). 대회 시상 포스터(금·은·동)의 트로피를 오려 낸 사진이다
// (web/assets/img/trophy-*.webp, 투명 바탕 · 높이 960px). 은상은 포스터의 센 빛 번짐 때문에 깨끗이 오려지지 않아 금상 트로피를
// 은빛으로 바꾼 것(세 포스터의 트로피 모양은 같다). 크기는 CSS 가 높이로 정하고 너비는 그림 비율을 따른다.
// 반짝임(그림 모양 안에서만 빛이 지나감)과 떠 있기(.trophy-spin)는 CSS 가 한다(동작 줄이기·느린 기기는 멈춘다).
import { html } from '../lib.js';

/** 그림 크기(px) — 받기 전에도 자리를 잡아 화면이 흔들리지 않게 */
const SIZE = { gold: [885, 960], silver: [885, 960], bronze: [874, 960] };
const src = (tier) => `assets/img/trophy-${tier}.webp`;

const held = [];
/** 큰 화면을 열 때 세 그림을 미리 받는다(발표 순간에 늦게 뜨지 않게) */
export function preloadTrophies() {
  if (held.length) return;
  Object.keys(SIZE).forEach((t) => {
    const img = new Image();
    img.src = src(t);
    held.push(img);
  });
}

export function Trophy({ tier = 'gold', spin = false }) {
  const t = SIZE[tier] ? tier : 'gold';
  return html`<span class=${`trophy t-${t}${spin ? ' trophy-spin' : ''}`} aria-hidden="true">
    <img src=${src(t)} width=${SIZE[t][0]} height=${SIZE[t][1]} alt="" decoding="async" draggable="false" />
  </span>`;
}
