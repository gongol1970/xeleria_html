from pathlib import Path
import re
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    match = re.search(rf"function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontro {name}")
    start = match.start()
    next_function = HTML.find("\nfunction ", match.end())
    if next_function < 0:
        next_function = len(HTML)
    return HTML[start:next_function]


class OnboardingRedirectContract(unittest.TestCase):
    def test_disconnected_tenant_stays_in_xeleria_to_connect_a_channel(self):
        body = function_body("gateIfNoConnectedChannels")

        self.assertIn("Conectá Mercado Libre o Tienda Nube para comenzar.", body)
        self.assertNotIn("redirectToInicio", body)
        self.assertIn("return false;", body)

    def test_login_redirect_never_exposes_tenant_id_in_query_string(self):
        body = function_body("redirectToInicio")

        self.assertNotIn("tenant_id", body)
        self.assertNotIn("tenantParam", body)
        self.assertIn("new URLSearchParams({next:next,reason:reason})", body)


if __name__ == "__main__":
    unittest.main()
