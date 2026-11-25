import type { JSX, PropsWithChildren } from "react";
import { Provider } from "react-redux";
import type { store as appStore } from "./index.js";

export function StoreProvider({
  children,
  store,
}: PropsWithChildren<{ store: typeof appStore }>): JSX.Element {
  return <Provider store={store}>{children}</Provider>;
}
