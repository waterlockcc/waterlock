import { blogRoute } from '@/lib/shared';

// The site is only a blog for now. A static export can't send a 30x, so the
// redirect is a meta refresh (React hoists it into <head>): it works on any
// static host and before any JS loads.
export default function Home() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${blogRoute}`} />
      <link rel="canonical" href={blogRoute} />
      <p className="m-auto p-8">
        Moved to <a href={blogRoute}>the blog</a>.
      </p>
    </>
  );
}
