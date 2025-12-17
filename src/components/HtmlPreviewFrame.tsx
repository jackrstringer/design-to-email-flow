import { useMemo } from 'react';

interface HtmlPreviewFrameProps {
  html: string;
  className?: string;
}

export function HtmlPreviewFrame({ html, className }: HtmlPreviewFrameProps) {
  // Wrap the HTML snippet in a full email document structure
  const emailDocument = useMemo(() => `
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
</html>`, [html]);

  return (
    <iframe
      srcDoc={emailDocument}
      title="HTML Preview"
      className={className}
      sandbox="allow-same-origin"
      style={{ border: 'none', width: '100%', minHeight: '400px', background: 'transparent' }}
    />
  );
}