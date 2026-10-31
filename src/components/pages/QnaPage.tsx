import type { QnaItem, SiteSettings } from '@/services/content/types';
import { QnaList } from './QnaList';

export function QnaPage({ qnas, settings }: { qnas: QnaItem[]; settings: SiteSettings }) {
  return (
    <>
      <div id="page" className="main">
        <div id="inner">
          <div id="text">
            <div id="title">자주 묻는 질문</div>
            <div id="description">
              루나에 대해서 자주 묻는 질문을 정리했습니다.
              <br />
              아래 질문들에 답변한 유튜브 영상이 있으니, <span id="bold">궁금하시다면 영상을 시청해주세요!</span>
            </div>
          </div>
          <iframe
            src={settings.qnaVideoUrl}
            title="LUNA Q&A"
            frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          ></iframe>
        </div>
      </div>
      <QnaList qnas={qnas} />
    </>
  );
}
