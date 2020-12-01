const expectAtLeastOneMatching = 'expectAtLeastOneMatching';
const expectExactlyNMatching = 'expectExactlyNMatching';
const expectExactlyOneMatching = 'expectExactlyOneMatching';
const allExpectFunctions = [
  //
  expectAtLeastOneMatching,
  expectExactlyNMatching,
  expectExactlyOneMatching
];

const testUtilsName = 'test_util';
const testUtilsExpectAtLeastOneMatching = `${testUtilsName}/${expectAtLeastOneMatching}`;
const testUtilsExpectExactlyNMatching = `${testUtilsName}/${expectExactlyNMatching}`;
const testUtilsExpectExactlyOneMatching = `${testUtilsName}/${expectExactlyOneMatching}`;

export default (fileInfo, api) => {
  const fileName = fileInfo.path;
  console.debug(`Inspecting ${fileName}`);
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const functionIdentifiers = [];
  const moduleIdentifiers = [];

  const declarations = root.find(j.VariableDeclaration, {
    declarations: [
      {
        init: {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'require'
          },
          arguments: [
            {
              value: v =>
                v.endsWith(testUtilsName) ||
                v.includes(testUtilsExpectAtLeastOneMatching) ||
                v.includes(testUtilsExpectExactlyNMatching) ||
                v.includes(testUtilsExpectExactlyOneMatching)
            }
          ]
        }
      }
    ]
  });

  if (declarations.length === 0) {
    console.debug(`Nothing found in ${fileName}`);
    return;
  }

  declarations.forEach(declaration => {
    const declarationNode = declaration.node;
    if (!declarationNode) {
      return;
    }
    const id = declarationNode.declarations[0]?.id;
    const requiredModule = declarationNode.declarations[0]?.init.arguments[0]?.value;
    if (!requiredModule) {
      return;
    }
    if (requiredModule.endsWith('test_util')) {
      const props = id?.properties;
      if (props) {
        props.forEach(prop => {
          // Something like:
          //   const { ...,
          //     expectAtLeastOneMatching,
          //     expectExactlyOneMatching,
          //     ... } = require('../../../../../core/test/test_util');
          if (
            prop.key?.name === expectAtLeastOneMatching ||
            prop.key?.name === expectExactlyNMatching ||
            prop.key?.name === expectExactlyOneMatching
          ) {
            functionIdentifiers.push(prop.value.name);
          }
        });
      } else {
        // Something like:
        //   const testUtils = require('../../../../../core/test/test_util');
        moduleIdentifiers.push(id.name);
      }
    } else {
      // Something like
      // const expectExactlyOneMatching = require('../../../../core/test/test_util/expectExactlyOneMatching);
      functionIdentifiers.push(id.name);
    }
  });

  if (functionIdentifiers.length === 0 && moduleIdentifiers.length === 0) {
    console.debug(`No matching identifiers in : ${fileName}.`);
    return;
  }
  // if (functionIdentifiers.length > 0) {
  //   console.debug(`Found direct function identifiers: ${functionIdentifiers.join(', ')}.`);
  // }
  // if (moduleIdentifiers.length > 0) {
  //   console.debug(`Found module identifiers: ${moduleIdentifiers.join(', ')}.`);
  // }

  functionIdentifiers.forEach(identifier => processFunctionIdentifier(fileName, j, root, identifier));
  moduleIdentifiers.forEach(identifier => processModuleIdentifier(fileName, j, root, identifier));
  return root.toSource();
};

function processFunctionIdentifier(fileName, j, root, identifier) {
  root
    .find(j.CallExpression, {
      callee: {
        name: identifier
      },
      arguments: hasArrowFunctionArgumentWithExpectations
    })
    .find(j.ArrowFunctionExpression)
    .replaceWith(arrowFunExp => {
      const expectationsExpressions = arrowFunExp.value?.body?.body;
      const itemName = arrowFunExp.value?.params[0]?.name;
      if (!expectationsExpressions) {
        return;
      }
      return j.arrayExpression(
        expectationsExpressions.map(expressionStatement =>
          j.arrowFunctionExpression([j.identifier(itemName)], expressionStatement.expression)
        )
      );
    });
}

function processModuleIdentifier(fileName, j, root, identifier) {
  allExpectFunctions.forEach(expectFunctionName =>
    root
      .find(j.CallExpression, {
        callee: {
          object: {
            name: identifier
          },
          property: {
            name: expectFunctionName
          }
        },
        arguments: hasArrowFunctionArgumentWithExpectations
      })
      .find(j.ArrowFunctionExpression)
      .replaceWith(arrowFunExp => {
        const expectationsExpressions = arrowFunExp.value?.body?.body;
        const itemName = arrowFunExp.value?.params[0]?.name;
        if (!expectationsExpressions) {
          return;
        }
        return j.arrayExpression(
          expectationsExpressions.map(expressionStatement =>
            j.arrowFunctionExpression([j.identifier(itemName)], expressionStatement.expression)
          )
        );
      })
  );
}

function hasArrowFunctionArgumentWithExpectations(args) {
  return (
    args.length === 2 &&
    args[1].type === 'ArrowFunctionExpression' &&
    !args[1].body?.body?.find(expectation => !isSimpleChaiExpectation(expectation))
  );
}

function isSimpleChaiExpectation(expectation) {
  return expectation.type === 'ExpressionStatement' && findExpectCallRecursive(expectation.expression);
}

function findExpectCallRecursive(astNode) {
  if (!astNode) {
    return null;
  }
  if (astNode.type === 'Identifier' && astNode.name === 'expect') {
    return astNode;
  }
  return findExpectCallRecursive(astNode.callee) || findExpectCallRecursive(astNode.object);
}
