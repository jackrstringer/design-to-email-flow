import { useEffect, useRef } from 'react';

interface HtmlPreviewFrameProps {
  html: string;
  className?: string;
}

export function HtmlPreviewFrame({ html, className }: HtmlPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Wrap the HTML snippet in a full email document structure
  const emailDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
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
      ref={iframeRef}
      title="HTML Preview"
      className={className}
      sandbox="allow-same-origin"
      style={{ border: 'none', width: '100%', height: '100%' }}
    />
  );
}
