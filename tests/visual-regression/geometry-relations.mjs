const finite = value => Number.isFinite(value);
const left = rect => finite(rect?.left) ? rect.left : rect?.x;
const top = rect => finite(rect?.top) ? rect.top : rect?.y;
const right = rect => finite(rect?.right) ? rect.right : (finite(left(rect)) && finite(rect?.width) ? left(rect) + rect.width : null);

export function cssPixelNumber(value) {
  if (typeof value !== 'string') return null;
  const parsed=Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function physicalHorizontalGap(first, second, rowTolerance = 3) {
  if (!first || !second) return null;
  const firstLeft = left(first), secondLeft = left(second), firstRight = right(first), secondRight = right(second);
  const firstTop = top(first), secondTop = top(second);
  if (![firstLeft, secondLeft, firstRight, secondRight, firstTop, secondTop].every(finite)) return null;
  if (Math.abs(firstTop - secondTop) >= rowTolerance) return null;
  const [physicalLeft, physicalRight] = firstLeft <= secondLeft
    ? [{ left: firstLeft, right: firstRight }, { left: secondLeft, right: secondRight }]
    : [{ left: secondLeft, right: secondRight }, { left: firstLeft, right: firstRight }];
  return physicalRight.left - physicalLeft.right;
}
