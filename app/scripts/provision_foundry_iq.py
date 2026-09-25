"""Create or update the Deal Room Foundry IQ knowledge base.

Uses the current Azure CLI identity for keyless Azure AI Search data-plane calls.
The checked-in corpus contains approved, non-deal-specific IC playbook guidance.

Run:
  python app/scripts/provision_foundry_iq.py \
    --search-endpoint https://<service>.search.windows.net \
    --foundry-endpoint https://<account>.cognitiveservices.azure.com
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_INDEX = "dealroom-ic-playbook-index"
DEFAULT_SOURCE = "dealroom-ic-playbook-source"
DEFAULT_KNOWLEDGE_BASE = "dealroom-ic-playbook"
INDEX_API_VERSION = "2026-04-01"
KNOWLEDGE_API_VERSION = "2026-08-01-preview"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--search-endpoint", required=True)
    parser.add_argument("--foundry-endpoint", required=True)
    parser.add_argument("--index-name", default=DEFAULT_INDEX)
    parser.add_argument("--knowledge-source", default=DEFAULT_SOURCE)
    parser.add_argument("--knowledge-base", default=DEFAULT_KNOWLEDGE_BASE)
    parser.add_argument("--model-deployment", default="gpt-5-mini")
    parser.add_argument("--model-name", default="gpt-5-mini")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "ic-playbook.json",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def normalized_endpoint(value, expected_suffix, label):
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(expected_suffix):
        raise ValueError(f"{label} must be an HTTPS endpoint ending in {expected_suffix}")
    return f"https://{parsed.netloc}"


def search_token():
    az = shutil.which("az") or shutil.which("az.cmd")
    if not az:
        raise RuntimeError("Azure CLI was not found on PATH")
    completed = subprocess.run(
        [
            az, "account", "get-access-token", "--scope",
            "https://search.azure.com/.default", "--query", "accessToken", "-o", "tsv",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    token = completed.stdout.strip()
    if not token:
        raise RuntimeError("Azure CLI returned an empty Azure AI Search token")
    return token


def request(endpoint, credential, method, path, api_version, payload=None):
    url = f"{endpoint}/{path}?api-version={urllib.parse.quote(api_version)}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    auth_headers = (
        {"api-key": credential["api_key"]}
        if credential.get("api_key")
        else {"Authorization": f"Bearer {credential['token']}"}
    )
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed ({error.code}): {detail}") from error


def index_definition(name):
    return {
        "name": name,
        "description": "Approved firm-wide diligence and Investment Committee standards. Contains no deal data.",
        "fields": [
            {"name": "id", "type": "Edm.String", "key": True, "searchable": True, "filterable": True, "retrievable": True},
            {"name": "title", "type": "Edm.String", "searchable": True, "retrievable": True},
            {"name": "workstream", "type": "Edm.String", "searchable": True, "filterable": True, "facetable": True, "retrievable": True},
            {"name": "stages", "type": "Collection(Edm.String)", "searchable": True, "filterable": True, "facetable": True, "retrievable": True},
            {"name": "source_path", "type": "Edm.String", "searchable": False, "filterable": True, "retrievable": True},
            {"name": "content", "type": "Edm.String", "searchable": True, "retrievable": True, "analyzer": "en.microsoft"},
        ],
        "semantic": {
            "defaultConfiguration": "ic-playbook-semantic",
            "configurations": [{
                "name": "ic-playbook-semantic",
                "prioritizedFields": {
                    "titleField": {"fieldName": "title"},
                    "prioritizedContentFields": [{"fieldName": "content"}],
                    "prioritizedKeywordsFields": [
                        {"fieldName": "workstream"},
                        {"fieldName": "stages"},
                    ],
                },
            }],
        },
    }


def knowledge_source_definition(name, index_name):
    return {
        "name": name,
        "kind": "searchIndex",
        "description": "Approved Deal Room diligence and IC playbook guidance.",
        "searchIndexParameters": {
            "searchIndexName": index_name,
            "semanticConfigurationName": "ic-playbook-semantic",
            "sourceDataFields": [
                {"name": "id"}, {"name": "title"}, {"name": "workstream"},
                {"name": "stages"}, {"name": "source_path"}, {"name": "content"},
            ],
            "searchFields": [{"name": "title"}, {"name": "workstream"}, {"name": "content"}],
        },
    }


def knowledge_base_definition(args, foundry_endpoint):
    return {
        "name": args.knowledge_base,
        "description": "Cited firm-wide diligence and Investment Committee guidance for Deal Room agents.",
        "retrievalInstructions": "Use only the approved playbook source. Treat sector and stage as routing context, never as evidence about a specific deal.",
        "answerInstructions": "Answer concisely. Cite every requirement. If the source does not support a claim, state that the playbook does not contain the answer.",
        "outputMode": "answerSynthesis",
        "knowledgeSources": [{"name": args.knowledge_source}],
        "models": [{
            "kind": "azureOpenAI",
            "azureOpenAIParameters": {
                "resourceUri": foundry_endpoint,
                "deploymentId": args.model_deployment,
                "modelName": args.model_name,
            },
        }],
        "retrievalReasoningEffort": {"kind": "low"},
        "retrieveDefaults": {
            "maxRuntimeInSeconds": 30,
            "maxOutputDocuments": 6,
            "maxOutputSizeInTokens": 5000,
        },
    }


def main():
    args = parse_args()
    search_endpoint = normalized_endpoint(args.search_endpoint, ".search.windows.net", "Search endpoint")
    foundry_endpoint = normalized_endpoint(args.foundry_endpoint, ".cognitiveservices.azure.com", "Foundry endpoint")
    documents = json.loads(args.corpus.read_text(encoding="utf-8"))
    if not isinstance(documents, list) or not documents:
        raise ValueError("The corpus must be a non-empty JSON array")

    resources = {
        "index": index_definition(args.index_name),
        "documents": {"value": [{"@search.action": "mergeOrUpload", **doc} for doc in documents]},
        "knowledgeSource": knowledge_source_definition(args.knowledge_source, args.index_name),
        "knowledgeBase": knowledge_base_definition(args, foundry_endpoint),
    }
    if args.dry_run:
        print(json.dumps(resources, indent=2))
        return

    admin_key = os.environ.get("AZURE_SEARCH_ADMIN_KEY", "").strip()
    credential = {"api_key": admin_key} if admin_key else {"token": search_token()}
    operations = [
        ("PUT", f"indexes/{urllib.parse.quote(args.index_name)}", INDEX_API_VERSION, resources["index"], "index"),
        ("POST", f"indexes/{urllib.parse.quote(args.index_name)}/docs/index", INDEX_API_VERSION, resources["documents"], "documents"),
        ("PUT", f"knowledgesources/{urllib.parse.quote(args.knowledge_source)}", KNOWLEDGE_API_VERSION, resources["knowledgeSource"], "knowledge source"),
        ("PUT", f"knowledgebases/{urllib.parse.quote(args.knowledge_base)}", KNOWLEDGE_API_VERSION, resources["knowledgeBase"], "knowledge base"),
    ]
    for method, path, version, payload, label in operations:
        request(search_endpoint, credential, method, path, version, payload)
        print(f"created or updated {label}")

    print(json.dumps({
        "FOUNDRY_IQ_SEARCH_ENDPOINT": search_endpoint,
        "FOUNDRY_IQ_KNOWLEDGE_BASE": args.knowledge_base,
        "FOUNDRY_IQ_KNOWLEDGE_SOURCE": args.knowledge_source,
        "FOUNDRY_IQ_API_VERSION": KNOWLEDGE_API_VERSION,
        "documents": len(documents),
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error