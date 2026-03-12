export type FaqItem = {
  question: string;
  answer: string;
};

type ToolFaqProps = {
  title?: string;
  items: FaqItem[];
};

export default function ToolFaq({
  title = 'FAQ',
  items,
}: ToolFaqProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <article
            key={item.question}
            className="rounded-xl border border-gray-200 p-5"
          >
            <h3 className="text-base font-semibold text-gray-900">
              {item.question}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">
              {item.answer}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
