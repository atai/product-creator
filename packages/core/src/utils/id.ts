const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function toLetters(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '');
}

export function generateProjectId(name: string, existingIds: Set<string>): string {
  const base = toLetters(name);
  let candidate = (base || 'projx').padEnd(5, 'x').slice(0, 5);
  let counter = 0;

  while (existingIds.has(candidate)) {
    const suffix = LETTERS[counter % LETTERS.length];
    candidate = candidate.slice(0, 4) + suffix;
    counter += 1;
    if (counter > LETTERS.length * 5) {
      candidate = randomLetters(5);
      break;
    }
  }

  return candidate;
}

export function generateAppId(projectId: string, name: string, existingIds: Set<string>): string {
  const base = toLetters(name);
  let suffix = (base || 'app').padEnd(3, 'a').slice(0, 3);
  let candidate = `${projectId}-${suffix}`;
  let counter = 0;

  while (existingIds.has(candidate)) {
    const letter = LETTERS[counter % LETTERS.length];
    suffix = suffix.slice(0, 2) + letter;
    candidate = `${projectId}-${suffix}`;
    counter += 1;
    if (counter > LETTERS.length * 5) {
      suffix = randomLetters(3);
      candidate = `${projectId}-${suffix}`;
      break;
    }
  }

  return candidate;
}

function randomLetters(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return result;
}




