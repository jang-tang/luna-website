'use client';

import { Fragment, useState } from 'react';
import type { QnaItem } from '@/services/content/types';

/** Q&A 아코디언 (원본 utils.qna.js: 질문 클릭 시 #item 에 active 토글, 답변 줄바꿈 → <br/>) */
export function QnaList({ qnas }: { qnas: QnaItem[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div id="page" className="qna" type="min" suppressHydrationWarning>
      <div id="inner">
        {qnas.map((qna) => (
          <div key={qna.key} id="item" className={open.has(qna.key) ? 'active' : undefined}>
            <div id="q" onClick={() => toggle(qna.key)}>
              <div id="mix">
                <div id="type">Q</div>
                <div id="text">{qna.question}</div>
              </div>
            </div>
            <div id="a">
              <div id="mix">
                <div id="type">A</div>
                <div id="text">
                  {qna.answer.split('\n').map((line, i) => (
                    <Fragment key={i}>
                      {i > 0 && <br />}
                      {line}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
