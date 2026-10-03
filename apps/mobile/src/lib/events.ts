/** Tiny in-app event bus for "something changed on another screen" (e.g. a review was posted). */
type Handler<T> = (payload: T) => void;

function channel<T>() {
  const handlers = new Set<Handler<T>>();
  return {
    emit: (payload: T) => handlers.forEach((h) => h(payload)),
    on: (h: Handler<T>) => {
      handlers.add(h);
      return () => void handlers.delete(h);
    },
  };
}

export const reviewPosted = channel<{ restaurantId: string; held: boolean }>();
