import { IO } from './io';
import { Task } from './task';
import { Either, isLeft, isRight } from './either';

export interface Step<TIn, TOut> {
  id: string;
  run(value: TIn): TOut;
}

export class Pipeline<T> {
  private readonly steps: Array<(value: any) => any> = [];

  constructor(private readonly name: string) {}

  add<TIn, TOut>(step: Step<TIn, TOut>): Pipeline<T> {
    this.steps.push(step.run);
    return this;
  }

  addMap<TIn, TOut>(id: string, fn: (input: TIn) => TOut): Pipeline<T> {
    this.steps.push(fn);
    return this;
  }

  run(input: any): any {
    let current = input;
    for (const step of this.steps) {
      current = step(current);
    }
    return current;
  }

  async runTask(input: T): Promise<any> {
    return Promise.resolve(this.run(input));
  }

  static fromIO<T>(name: string, io: IO<T>): Pipeline<Awaited<T>> {
    return new Pipeline(name).addMap<IO<T>, Awaited<T>>('io', async () => io.run() as Promise<Awaited<T>>);
  }

  static fromTask<T>(name: string, task: Task<T>): Pipeline<T> {
    return new Pipeline(name).addMap<Task<T>, T>('task', () => task.run()).addMap(async (t) => await t);
  }

  static fromEither<E, A>(name: string, either: Either<E, A>): Pipeline<A> {
    return isLeft(either)
      ? new Pipeline(name).addMap(() => { throw new Error(String(either.error)); })
      : new Pipeline(name).addMap(() => either.value);
  }
}
