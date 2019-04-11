module.exports = {
  "extends": ["airbnb", "plugin:prettier/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "prettier/prettier": [2, {
      "printWidth": 120
    }],
    "semi": [2, "never"],
    "comma-dangle": [2, {
      "arrays": "always-multiline",
      "objects": "always-multiline",
      "imports": "always-multiline",
      "exports": "always-multiline",
      "functions": "ignore"
    }],
    "import/no-extraneous-dependencies": [2, {
      "devDependencies": true
    }],
    "no-unused-vars": "off",
    "implicit-arrow-linebreak": "off",
    "@typescript-eslint/no-unused-vars": ["error", {
      "vars": "local",
      "args": "after-used",
      "ignoreRestSiblings": false
    }],
    "arrow-parens": [2, "as-needed"],
    "max-len": [2, {
      "code": 120,
      "ignoreComments": true,
      "ignoreTrailingComments": true,
      "ignoreUrls": true,
      "ignoreStrings": true,
      "ignoreTemplateLiterals": true,
      "ignoreRegExpLiterals": true,
    }],
    "object-curly-newline": ["error", {
      "ObjectExpression": {
        "consistent": true
      },
      "ObjectPattern": {
        "consistent": true
      },
      "ImportDeclaration": {
        "consistent": true,
      },
      "ExportDeclaration": {
        "multiline": true,
        "minProperties": 3
      }
    }],
    "no-plusplus": [0],
    "no-console": [2, {
      "allow": ["warn", "error", "info"]
    }]
  },
  "globals": {
    "BigInt": "readonly"
  },
  "env": {
    "jest": true,
    "browser": true,
    "node": true
  },
  "settings": {
    "import/resolver": {
      "node": {
        "paths": ["src"],
        "extensions": [".js", ".jsx", ".ts", ".tsx"]
      }
    }
  }
};
