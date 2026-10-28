#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1-Command Cross-Platform Installer for Infinite LLM Auto-Fallback Router
Works for both CLI users and AI Coding Agents (Antigravity, Claude Code, Cursor, Codex).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser(description="Install Infinite LLM Auto-Fallback Router & Agent Skill")
    parser.add_argument("--home", type=str, default=os.path.expanduser("~"), help="Target user home directory")
    args = parser.parse_args()

    home = os.path.abspath(args.home)
    src_dir = os.path.dirname(os.path.abspath(__file__))

    target_bin_dir = os.path.join(home, ".infinite-llm-router")
    os.makedirs(target_bin_dir, exist_ok=True)

    router_dst = os.path.join(target_bin_dir, "llm_fallback_router.py")
    shutil.copy2(os.path.join(src_dir, "llm_fallback_router.py"), router_dst)

    patches_src = os.path.join(src_dir, "9router-patches")
    patches_dst = os.path.join(target_bin_dir, "9router-patches")
    if os.path.isdir(patches_src):
        os.makedirs(patches_dst, exist_ok=True)
        for fn in os.listdir(patches_src):
            s = os.path.join(patches_src, fn)
            if os.path.isfile(s):
                shutil.copy2(s, os.path.join(patches_dst, fn))

    # Install Skill into both Antigravity (.gemini/config/skills) and Claude Code (.claude/skills)
    agy_skill_dir = os.path.join(home, ".gemini", "config", "skills", "infinite-llm-fallback-router")
    claude_skill_dir = os.path.join(home, ".claude", "skills", "infinite-llm-fallback-router")
    for sdir in (agy_skill_dir, claude_skill_dir):
        os.makedirs(sdir, exist_ok=True)
        shutil.copy2(os.path.join(src_dir, "SKILL.md"), os.path.join(sdir, "SKILL.md"))

    print(
        json.dumps(
            {
                "status": "installed",
                "router_script": router_dst,
                "agy_skill": os.path.join(agy_skill_dir, "SKILL.md"),
                "claude_skill": os.path.join(claude_skill_dir, "SKILL.md"),
                "run_command": f'"{sys.executable}" "{router_dst}" --port 20128',
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
