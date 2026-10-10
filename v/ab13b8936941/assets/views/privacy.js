// 개인정보 처리 안내(개인정보 보호법 제15조·제22조·제26조·제28조의8 고지 항목).
import { html, useApp } from '../lib.js';

function Block({ title, rows }) {
  return html`<section class="panel">
    <div class="panel-h"><h2>${title}</h2></div>
    <dl class="kv">${rows.map(([k, v, key]) => (key
      ? html`<dt><b>${k}</b></dt><dd class="key-text">${v}</dd>`
      : html`<dt>${k}</dt><dd>${v}</dd>`))}</dl>
  </section>`;
}

export function PrivacyView() {
  const { config } = useApp();
  const p = config.privacy;
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>개인정보 처리 안내</h1>
      <p>${p.controller}는 ${config.event.name} 운영을 위해 아래와 같이 개인정보를 처리합니다. 신청할 때 참가자 각자가 항목별로 동의합니다.</p></div></div>
    <div class="stack" style="max-width:860px">
      <${Block} title="1. 수집·이용(필수)" rows=${[
        ['목적', p.collect.purpose], ['항목', p.collect.items], ['보유·이용 기간', p.collect.retention, true], ['동의 거부 권리', p.collect.refuse],
      ]} />
      <${Block} title="2. 국외 이전(필수)" rows=${[
        ['이전 항목', p.overseas.items], ['이전받는 자', p.overseas.recipient, true], ['이전 국가', p.overseas.country],
        ['이전 시기·방법', p.overseas.when], ['이용 목적', p.overseas.purpose, true], ['보유·이용 기간', p.overseas.retention, true],
        ['거부 방법·효과', p.overseas.refuse],
      ]} />
      <${Block} title="3. 사진·영상 촬영 및 활용(선택)" rows=${[
        ['목적', p.media.purpose], ['항목', p.media.items], ['보유·이용 기간', p.media.retention, true], ['동의 거부 권리', p.media.refuse],
      ]} />
      <${Block} title="4. 처리 위탁·공개 범위" rows=${[['처리 위탁', p.processor], ['공개 범위', p.disclosure]]} />
      <${Block} title="5. 정보주체의 권리와 안전 조치" rows=${[['권리 행사', p.rights], ['안전성 확보 조치', p.security], ['문의', p.contact]]} />
      <${Block} title="6. 개인정보 보호책임자와 권익 침해 구제" rows=${[['보호책임자·처리방침', p.officer], ['권익 침해 구제', p.remedy]]} />
      <div class="mustread"><span class="label-red">필독</span><div><strong>${config.training.notice}</strong><p>${config.training.detail}</p></div></div>
    </div>
  </div>`;
}
