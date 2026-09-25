import { useBrowser } from "../store";
import { Favicon } from "./bits";

export default function BookmarksBar() {
  const { state, api } = useBrowser();
  const bms = state.bookmarks;

  return (
    <div className="bm-bar">
      {bms.length === 0 && (
        <span className="bm-empty">
          <i className="ri-star-line" />
          Bookmarks bar — hit the <i className="ri-star-fill" style={{ color: "var(--accent)" }} /> in the address bar to pin a page here
        </span>
      )}
      {bms.slice(-14).map((b) => (
        <div key={b.id} className="bm-item" title={b.url} onClick={() => api.navigate(b.url)}>
          <Favicon url={b.url} size={13} />
          <span>{b.title}</span>
        </div>
      ))}
      {bms.length > 14 && (
        <div className="bm-item action" title="Show all bookmarks" onClick={() => api.setPanel("bookmarks")}>
          <i className="ri-more-fill" /><span>{bms.length - 14} more</span>
        </div>
      )}
    </div>
  );
}
