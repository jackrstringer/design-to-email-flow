import { useEffect, useRef, useMemo } from 'react';

interface HtmlPreviewFrameProps {
  html: string;
  className?: string;
}

export function HtmlPreviewFrame({ html, className }: HtmlPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Create a simple hash of the html to use as a key for forcing re-renders
  const htmlKey = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < html.length; i++) {
      const char = html.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }, [html]);

  // Wrap the HTML snippet in a full email document structure
  const emailDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      width: 600px;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    ${html}
  </div>
</body>
</html>`;

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(emailDocument);
        doc.close();
        
        // Auto-resize to content height
        setTimeout(() => {
          if (iframeRef.current?.contentDocument?.body) {
            const contentHeight = iframeRef.current.contentDocument.body.scrollHeight;
            iframeRef.current.style.height = `${contentHeight}px`;
          }
        }, 50);
      }
    }
  }, [emailDocument]);

  return (
    <iframe
      key={htmlKey}
      ref={iframeRef}
      title="HTML Preview"
      className={className}
      sandbox="allow-same-origin"
      style={{ border: 'none', width: '100%', background: 'transparent' }}
    />
  );
}