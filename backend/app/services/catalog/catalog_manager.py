"""
Multi-domain CatalogManager — loads YAML catalog files per (domain, client_id).

Domain selector in the UI sets domain = "cpg" | "cold_chain".
CatalogManager returns the right metrics/dimensions/time_windows for the DSPy agents.

Adding a new domain = drop a YAML file into domains/<new_domain>/
No code change required.
"""
from __future__ import annotations
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_CATALOG_ROOT = Path(__file__).parent / "domains"


class CatalogManager:
    """
    Loads and caches catalog YAML for a given (domain, client_id).
    Thread-safe (lru_cache on inner loader).
    """

    def __init__(self, domain: str = "cpg", client_id: str = "nestle"):
        self.domain = domain
        self.client_id = client_id
        self._catalog = self._load(domain, client_id)

    @staticmethod
    @lru_cache(maxsize=32)
    def _load(domain: str, client_id: str) -> dict:
        # Try client-specific first, then domain-wide fallback
        paths = [
            _CATALOG_ROOT / domain / f"client_{client_id}.yaml",
            _CATALOG_ROOT / domain / f"default.yaml",
        ]
        for p in paths:
            if p.exists():
                with open(p) as f:
                    data = yaml.safe_load(f)
                logger.info("Loaded catalog from %s", p)
                return data or {}
        logger.warning("No catalog found for domain=%s client=%s — using empty catalog", domain, client_id)
        return {}

    # ── Accessors ─────────────────────────────────────────────────────────

    def get_metrics(self) -> list[dict]:
        return self._catalog.get("metrics", [])

    def get_dimensions(self) -> list[dict]:
        return self._catalog.get("dimensions", [])

    def get_time_windows(self) -> list[dict]:
        return self._catalog.get("time_windows", [])

    def get_metric(self, name: str) -> dict | None:
        for m in self.get_metrics():
            if m.get("name") == name or name in m.get("synonyms", []):
                return m
        return None

    def get_dimension(self, name: str) -> dict | None:
        for d in self.get_dimensions():
            if d.get("name") == name or name in d.get("synonyms", []):
                return d
        return None

    def metric_names(self) -> list[str]:
        return [m["name"] for m in self.get_metrics()]

    def dimension_names(self) -> list[str]:
        return [d["name"] for d in self.get_dimensions()]

    def to_dspy_context(self) -> dict:
        """
        Returns context dict injected into DSPy agent prompts:
        available_metrics, available_dimensions, time_windows.
        """
        return {
            "available_metrics": [
                {"name": m["name"], "description": m.get("description", ""), "synonyms": m.get("synonyms", [])}
                for m in self.get_metrics()
            ],
            "available_dimensions": [
                {"name": d["name"], "description": d.get("description", ""), "groupable": d.get("groupable", True)}
                for d in self.get_dimensions()
            ],
            "time_windows": [tw["name"] for tw in self.get_time_windows()],
            "domain": self.domain,
            "client_id": self.client_id,
        }

    # ── Domain listing (for UI dropdown) ─────────────────────────────────

    @staticmethod
    def list_domains() -> list[dict]:
        """Return available domains for the domain selector dropdown."""
        domains = []
        if not _CATALOG_ROOT.exists():
            return domains
        for domain_dir in sorted(_CATALOG_ROOT.iterdir()):
            if domain_dir.is_dir():
                meta_file = domain_dir / "meta.yaml"
                meta = {}
                if meta_file.exists():
                    with open(meta_file) as f:
                        meta = yaml.safe_load(f) or {}
                domains.append({
                    "id": domain_dir.name,
                    "label": meta.get("label", domain_dir.name.replace("_", " ").title()),
                    "description": meta.get("description", ""),
                    "available": meta.get("available", True),
                })
        return domains
