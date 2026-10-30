import { Suspense, use } from 'react';
import { createPortal, browser } from 'react-dom';

export function Panel(props) {
  return (
    <Suspense fallback={null}>
      <PanelBrowserOnly {...props} />
    </Suspense>
  );
}

function PanelBrowserOnly({ children }) {
  use(browser());
  return createPortal(children, document.body);
}
