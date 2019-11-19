const { src, dest, series, parallel, watch } = require('gulp');
const npm = require('npm');
const pkg = require('./package.json');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const postcss = require('gulp-postcss');
const concat = require('gulp-concat');
const rm = require('gulp-rm');
const mustache = require('gulp-mustache');
const livereload = require('gulp-livereload');
const polka = require('polka');
const compression = require('compression');
const sirv = require('sirv');

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

const clean = () =>
  src(['dist/**/*', 'build/**/*'], { read: false }).pipe(rm());
exports.clean = clean;

const tailwind = () =>
  src('src/tailwind.css')
    .pipe(postcss())
    .pipe(dest('build/'))
    .pipe(livereload());

const rollup = async () => {
  await new Promise(resolve => npm.load(resolve));

  // trigger rollup build
  await new Promise((resolve, reject) =>
    npm.run('build', err => {
      if (err) return reject(err);
      resolve();
    })
  );
};

const ssr = async () => {
  // parse task arguments
  const props = yargs.argv.props || {};
  const target = yargs.argv.target || 'document.body';

  // render server side resources
  const ssr = require('./build/server');
  const { html, css, head } = ssr.render(props);

  if (!fs.existsSync('./dist')) {
    fs.mkdirSync('./dist');
  }

  // write template parts
  fs.writeFileSync('./dist/_body.html', html);
  fs.writeFileSync('./dist/_head.html', head);

  // process css
  fs.writeFileSync('./build/svelte.css', css.code);

  // process scripts
  const js = fs.readFileSync(path.join(__dirname, 'build/client.js'), 'utf8');
  const scripts = `<script>${js}</script>
    
<script>
  new ${name}({
    target: ${target},
    hydrate: true,
    props: ${JSON.stringify(props)}
  });
</script>`;

  fs.writeFileSync('dist/_scripts.html', scripts);
};

const css = () =>
  src('build/*.css')
    .pipe(concat('styles.css'))
    .pipe(dest('dist/'))
    .pipe(livereload());

const static = () =>
  src('static/**/*')
    .pipe(dest('dist/static'))
    .pipe(livereload());

const example = () => {
  const body = fs.readFileSync('dist/_body.html', 'utf8').toString();
  const head = fs.readFileSync('dist/_head.html', 'utf8').toString();
  const scripts = fs.readFileSync('dist/_scripts.html', 'utf8').toString();

  return src('index.html')
    .pipe(
      mustache({
        body,
        styles: [`<link rel="stylesheet" href="styles.css">`],
        head,
        scripts,
      })
    )
    .pipe(dest('dist'))
    .pipe(livereload());
};

const dist = series(
  clean,
  parallel(tailwind, series(rollup, ssr)),
  css,
  parallel(static, example)
);
exports.default = dist;
exports.dist = dist;

const dev = () => {
  watch('src/**/*', { ignoreInitial: false }, dist);
  watch('static/**/*', static);

  const port = process.env.PORT || yargs.argv.port || '3001';

  polka()
    .use(
      compression({ threshold: 0 }),
      sirv('dist', { dev }),
      livereload.middleware,
      (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/html',
        });

        fs.readFileSync('dist/example.html', 'utf8').toString();
        res.end(html);
      }
    )
    .listen(port, err => {
      if (err) console.log('error', err);
      console.log(`listening on port ${port}`);
    });
};
exports.dev = dev;
