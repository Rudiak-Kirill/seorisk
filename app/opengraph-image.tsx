import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#f8fafc',
          color: '#111827',
          padding: '48px',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            borderRadius: 32,
            border: '1px solid #e5e7eb',
            background: '#ffffff',
            padding: '44px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 40,
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                maxWidth: 620,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: '5px solid #f97316',
                    borderRightColor: 'transparent',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 3,
                      right: -4,
                      width: 13,
                      height: 7,
                      borderLeft: '5px solid #f97316',
                      borderBottom: '5px solid #f97316',
                      transform: 'rotate(-45deg)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>SEORISK.RU</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, lineHeight: 1.05 }}>
                  SEO для CEO — проверка рендеринга и индексируемости
                </div>
                <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.4, color: '#4b5563' }}>
                  Browser, Googlebot, Яндекс, LLM-боты, robots.txt, canonical и sitemap —
                  всё в одном экране.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                width: 360,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderRadius: 24,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  padding: '22px 24px',
                }}
              >
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: '#b91c1c' }}>
                  Есть расхождения
                </div>
                <div style={{ display: 'flex', fontSize: 16, color: '#7f1d1d' }}>
                  Googlebot получает ошибку, а браузер видит страницу нормально.
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  borderRadius: 24,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  padding: '20px 24px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                  <span>Browser</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>200</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                  <span>Googlebot</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>504</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                  <span>Index Check</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>robots ok</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {['SSR Check', 'LLM Check', 'Index Check'].map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  border: '1px solid #fdba74',
                  background: '#fff7ed',
                  color: '#c2410c',
                  fontSize: 18,
                  fontWeight: 700,
                  padding: '12px 22px',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
