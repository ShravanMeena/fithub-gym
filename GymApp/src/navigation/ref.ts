import { createNavigationContainerRef } from '@react-navigation/native';

export const navRef = createNavigationContainerRef();

export function navTo(name: string, params?: object) {
  if (navRef.isReady()) (navRef.navigate as any)(name, params);
}
