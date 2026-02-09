#!/usr/bin/env bash

#######################################
# Tab-completion for runcollector / runcollector-nw
#
# Source this file in your .bashrc:
#   source ~/dev/instana/nodejs/bin/run-tests-completion.sh
#######################################

_RUNCOLLECTOR_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
_RUNCOLLECTOR_CACHE_FILE="/tmp/.runcollector-packages-cache"

_runcollector_build_cache() {
  local test_base="$_RUNCOLLECTOR_REPO_ROOT/packages/collector/test"

  {
    find "$test_base" -name node_modules -prune -o -path "*/_v*" -prune -o -name "test_base.js" -print 2>/dev/null | while IFS= read -r f; do
      local d name parent
      d=$(dirname "$f")
      name=$(basename "$d")
      parent=$(basename "$(dirname "$d")")
      [[ "$parent" == @* ]] && name="$parent/$name"
      echo "$name"
    done

    find "$test_base" -name node_modules -prune -o -path "*/_v*" -prune -o -name "*.test.js" -print 2>/dev/null | while IFS= read -r f; do
      basename "$f" .test.js
    done
  } | sort -u > "$_RUNCOLLECTOR_CACHE_FILE"
}

_runcollector_completions() {
  local old_wordbreaks="$COMP_WORDBREAKS"
  COMP_WORDBREAKS="${COMP_WORDBREAKS//@/}"

  local cur="${COMP_WORDS[COMP_CWORD]}"

  if [ ! -s "$_RUNCOLLECTOR_CACHE_FILE" ]; then
    _runcollector_build_cache
  fi

  # Version completion: package@<TAB>
  if [[ "$cur" == *"@"* ]] && [[ "$cur" != @* ]]; then
    local pkg="${cur%%@*}"
    local test_base="$_RUNCOLLECTOR_REPO_ROOT/packages/collector/test"
    local pkg_dir
    pkg_dir=$(find "$test_base" -name node_modules -prune -o -path "*/_v*" -prune -o -type d -name "$pkg" -print 2>/dev/null | head -1)
    if [ -n "$pkg_dir" ]; then
      local completions=""
      while IFS= read -r v; do
        completions+="${pkg}@${v} "
      done < <(find "$pkg_dir" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sed 's/.*_v//' | sort -V)
      COMPREPLY=($(compgen -W "$completions" -- "$cur"))
      COMP_WORDBREAKS="$old_wordbreaks"
      return
    fi
  fi

  COMPREPLY=($(compgen -W "$(cat "$_RUNCOLLECTOR_CACHE_FILE" 2>/dev/null)" -- "$cur"))
  COMP_WORDBREAKS="$old_wordbreaks"
}

# Build cache on source (<1s with -prune)
_runcollector_build_cache

complete -o nospace -F _runcollector_completions runcollector
complete -o nospace -F _runcollector_completions runcollector-nw
