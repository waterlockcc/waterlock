/**
 * Structured data for search engines (schema.org JSON-LD). Takes our own
 * objects only; `<` is escaped so no string in them can close the tag.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
