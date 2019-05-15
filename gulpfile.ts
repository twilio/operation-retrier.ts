const gulp = require('gulp');
const del = require('del');
const tslint = require('gulp-tslint');
const cp = require('child_process');
const typescript = require('gulp-typescript');

const config = {
    lib: {
        dir: 'lib'
    },
    lint: {
        files: [
            'gulpfile.ts',
            'src/**/*.ts',
            'test/**/*.ts'
        ]
    },
    unit: {
        files: 'test/*.ts'
    }
};

gulp.task('clean', function() {
    return del([config.lib.dir]);
});

gulp.task('lint', function() {
    return gulp
        .src(config.lint.files)
        .pipe(tslint())
        .pipe(tslint.report({
            allowWarnings: false,
            emitError: true,
            summarizeFailureOutput: true
        }));
});

gulp.task('unitTest', function(cb) {
    cp.exec(['FORCE_COLOR=1', 'NODE_ENV=test',
        './node_modules/mocha/bin/mocha', '-r ts-node/register', 'test/*ts'
    ].join(' '), cb).stdout.pipe(process.stdout);
});

gulp.task('buildLib', function() {
    const tsProject = typescript.createProject('tsconfig.json');
    return tsProject.src()
        .pipe(tsProject())
        .pipe(gulp.dest('lib'));
});

gulp.task('default',
    gulp.series(
        'clean',
        'lint',
        'unitTest',
        'buildLib'
    ));