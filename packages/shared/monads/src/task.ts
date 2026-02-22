export interface Task<A> { readonly run: () => Promise<A>; }

export const taskOf = <A>(value: A): Task<A> => ({ run: () => Promise.resolve(value) });

export const taskMap = <A, B>(fa: Task<A>, f: (value: A) => B): Task<B> => ({ run: async () => f(await fa.run()) });

export const taskChain = <A, B>(fa: Task<A>, f: (value: A) => Task<B>): Task<B> => ({ run: async () => f(await fa.run()).run() });

export const taskPar = <A>(tasks: readonly Task<A>[]): Task<A[]> => ({
  run: () => Promise.all(tasks.map((task) => task.run())),
});

export async function race<T>(tasks: readonly Task<T>[]): Promise<T> {
  return Promise.race(tasks.map((task) => task.run()));
}

export function delay(ms: number): Task<void> {
  return { run: () => new Promise((resolve) => setTimeout(resolve, ms)) };
}
