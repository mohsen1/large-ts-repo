import { IO } from './io';
import { Task } from './task';
import { Either, isLeft, isRight } from './either';

export interface Step<TIn, TOut> {
  id: string;
  run(value: TIn): TOut;
}

export class Pipeline<T> {
  private readonly steps: Array<(value: any) => any | Promise<any>> = [];

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

  async runTask(input: T): Promise<Awaited<T>> {
    let current = input as any;
    for (const step of this.steps) {
      current = await Promise.resolve(step(current));
    }
    return current as Awaited<T>;
  }

  static fromIO<T>(name: string, io: IO<T>): Pipeline<T> {
    return new Pipeline<T>(name).addMap<IO<T>, T>('io', () => io.run());
  }

  static fromTask<T>(name: string, task: Task<T>): Pipeline<Awaited<T>> {
    return new Pipeline<Awaited<T>>(name).addMap<Task<T>, Awaited<T>>('task', () => task.run() as Awaited<T>);
  }

  static fromEither<E, A>(name: string, either: Either<E, A>): Pipeline<A> {
    return isLeft(either)
      ? new Pipeline<A>(name).addMap('either-left', () => {
          throw new Error(String(either.error));
        })
      : new Pipeline<A>(name).addMap('either-right', () => either.value);
  }
}
