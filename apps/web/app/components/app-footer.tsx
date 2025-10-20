export const AppFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <span className="app-footer__copyright">
          © {year} Werpool. Your forecast is your asset.
        </span>
        <div className="app-footer__links">
          <a href="https://developers.flow.com" target="_blank" rel="noreferrer">
            Flow Docs
          </a>
          <a
            href="https://status.onflow.org/"
            target="_blank"
            rel="noreferrer"
          >
            Network Status
          </a>
          <a href="https://github.com/onflow" target="_blank" rel="noreferrer">
            Ecosystem
          </a>
        </div>
      </div>
    </footer>
  );
};
