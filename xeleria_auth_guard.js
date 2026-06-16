(function () {
  const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const publicPages = {
    "": true,
    "index.html": true,
    "inicio.html": true
  };

  if (publicPages[file]) return;

  const qp = new URLSearchParams(location.search);

  if (qp.get("reset") === "1") {
    localStorage.removeItem("xeleria_tenant_id");
    localStorage.removeItem("xeleria_session");
    localStorage.removeItem("xeleria_owner_key");
  }

  const incomingTenant = qp.get("tenant_id") || qp.get("tenant") || "";
  if (incomingTenant && incomingTenant !== DEFAULT_TENANT) {
    localStorage.setItem("xeleria_tenant_id", incomingTenant);
  }

  const tenant = localStorage.getItem("xeleria_tenant_id") || "";

  if (!tenant || tenant === DEFAULT_TENANT) {
    const next = encodeURIComponent(file || "index.html");
    location.replace("inicio.html?next=" + next);
  }
})();
