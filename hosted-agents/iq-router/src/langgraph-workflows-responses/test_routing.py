import unittest

from routing import route_prompt


class RoutingTests(unittest.TestCase):
    def test_routes_each_iq(self):
        cases = {
            "Use the IC memo playbook": ("foundry", "deal-room-foundry-iq"),
            "Show portfolio IRR trends": ("fabric", "deal-room-fabric-iq"),
            "Summarize the latest Teams meeting": ("work", "deal-room-work-iq"),
            "Search the web for current news": ("web", "deal-room-web-iq"),
        }
        for prompt, (expected_id, expected_agent) in cases.items():
            with self.subTest(prompt=prompt):
                route = route_prompt(prompt)
                self.assertEqual(route["id"], expected_id)
                self.assertEqual(route["agent"], expected_agent)

    def test_blocks_mixed_internal_and_public_request(self):
        route = route_prompt("Use the Teams meeting and latest public news")
        self.assertTrue(route["blockedCombination"])
        self.assertEqual(route["trace"][-1]["status"], "blocked")

    def test_defaults_to_foundry_synthesis(self):
        self.assertEqual(route_prompt("Help me think this through")["id"], "foundry")


if __name__ == "__main__":
    unittest.main()