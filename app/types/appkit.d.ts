import 'react';

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'appkit-button': React.HTMLAttributes<HTMLElement>;
      'appkit-network-button': React.HTMLAttributes<HTMLElement>;
    }
  }
}