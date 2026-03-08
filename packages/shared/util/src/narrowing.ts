export const isPresent = <T>(value: T) => value != null;

export const isTruthy = <T>(value: T) => Boolean(value);

export const describeScalar = (value: string | number | boolean | Date): string => {
  switch (true) {
    case value instanceof Date:
      return value.toISOString();
    case typeof value === 'string':
      return value.toUpperCase();
    case typeof value === 'number':
      return value.toFixed(2);
    case typeof value === 'boolean':
      return value ? 'true' : 'false';
    default: {
      const exhaustive: never = value;
      return String(exhaustive);
    }
  }
};
