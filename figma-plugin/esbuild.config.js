const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Build the main plugin code (runs in Figma sandbox)
const buildCode = esbuild.build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2020',
  format: 'iife',
  watch: isWatch ? {
    onRebuild(error) {
      if (error) console.error('Code rebuild failed:', error);
      else console.log('Code rebuilt');
    }
  } : false
});

// Build the UI (runs in iframe)
const buildUI = esbuild.build({
  entryPoints: ['src/ui.tsx'],
  bundle: true,
  outfile: 'dist/ui.js',
  target: 'es2020',
  format: 'iife',
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  watch: isWatch ? {
    onRebuild(error) {
      if (error) console.error('UI rebuild failed:', error);
      else {
        console.log('UI rebuilt');
        generateHTML();
      }
    }
  } : false
});

function generateHTML() {
  const js = fs.readFileSync('dist/ui.js', 'utf8');
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 12px;
      background: #1e1e1e;
      color: #fff;
      overflow: hidden;
    }
    #root { height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;
  fs.writeFileSync('dist/ui.html', html);
}

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

Promise.all([buildCode, buildUI]).then(() => {
  generateHTML();
  console.log(isWatch ? 'Watching for changes...' : 'Build complete!');
}).catch(() => process.exit(1));
