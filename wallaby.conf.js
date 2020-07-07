module.exports = function (wallaby) {
    
    return {
        localProjectDir: "tests",
        
        files: [
            '/*.js',
        ],

        tests: [
            '/tests/**/*test.js',
            '!/node_modules/**/*.js',
            '!/api/node_modules/**/*.js',
            '!/tests/node_modules/**/*.js',
        ],
        
        env: { type: 'node' },
        testFramework: 'jest',
    }
};