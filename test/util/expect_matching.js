module.exports = exports = function expectOneMatching(arr, fn) {
  if (!arr || arr.length === 0) {
    throw new Error('Could not find an item which matches all given criteria. Got 0 items.');
  }

  let error;

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    try {
      fn(item);
      return item;
    } catch (e) {
      error = e;
    }
  }

  if (error) {
    throw new Error(
      'Could not find an item which matches all given criteria. Got ' +
        arr.length +
        ' items. Last error: ' +
        error.message +
        '. All Items:\n' +
        JSON.stringify(arr, 0, 2) +
        '. Error stack trace: ' +
        error.stack
    );
  }
};
