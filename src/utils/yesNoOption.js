export function addYesNoChoices(option) {
  return option.addChoices(
    { name: '是', value: 'yes' },
    { name: '否', value: 'no' }
  );
}

export function parseYesNoChoice(value, defaultValue = null) {
  if (value === 'yes') {
    return true;
  }

  if (value === 'no') {
    return false;
  }

  return defaultValue;
}
