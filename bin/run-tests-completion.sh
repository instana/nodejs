#!/usr/bin/env bash

#######################################
# Tab-completion for runcollector / runcollector-nw
#
# Supports:
#   runcollector-nw <package><TAB>
#   runcollector-nw <package>@<TAB>          (version completion)
#   runcollector-nw <package> <TAB>          (mode completion)
#   runcollector-nw <package>@<version> <TAB> (mode completion)
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

# Find the package directory for a given package name
_runcollector_find_pkg_dir() {
  local pkg="$1"
  local test_base="$_RUNCOLLECTOR_REPO_ROOT/packages/collector/test"

  if [[ "$pkg" == @* ]]; then
    local scope="${pkg%%/*}"
    local name="${pkg#*/}"
    find "$test_base" -name node_modules -prune -o -path "*/_v*" -prune -o -type d -name "$name" -print 2>/dev/null | while IFS= read -r d; do
      if [[ "$(basename "$(dirname "$d")")" == "$scope" ]]; then
        echo "$d"
        break
      fi
    done
  else
    find "$test_base" -name node_modules -prune -o -path "*/_v*" -prune -o -type d -name "$pkg" -print 2>/dev/null | head -1
  fi
}

# Get available modes for a package (from modes.json or _v* test file names)
_runcollector_get_modes() {
  local pkg_dir="$1"

  if [ -f "$pkg_dir/modes.json" ]; then
    node -e "console.log(JSON.parse(require('fs').readFileSync('$pkg_dir/modes.json','utf8')).join('\n'))" 2>/dev/null
  else
    # Non-mode packages: list test file name stems (without .test.js)
    local version_dir
    version_dir=$(find "$pkg_dir" -maxdepth 1 -type d -name "_v*" 2>/dev/null | sort -V | tail -1)
    if [ -n "$version_dir" ]; then
      find "$version_dir" -maxdepth 2 -name "*.test.js" 2>/dev/null | while IFS= read -r f; do
        basename "$f" .test.js
      done
    fi
  fi
}

_runcollector_completions() {
  local old_wordbreaks="$COMP_WORDBREAKS"
  COMP_WORDBREAKS="${COMP_WORDBREAKS//@/}"

  local cur="${COMP_WORDS[COMP_CWORD]}"

  if [ ! -s "$_RUNCOLLECTOR_CACHE_FILE" ]; then
    _runcollector_build_cache
  fi

  # Determine which argument we're completing (skip flags like -nw)
  local arg_index=0
  local pkg_arg=""
  for (( i=1; i<COMP_CWORD; i++ )); do
    local w="${COMP_WORDS[$i]}"
    [[ "$w" == -* ]] && continue
    arg_index=$((arg_index + 1))
    if [ "$arg_index" -eq 1 ]; then
      pkg_arg="$w"
    fi
  done

  # Mode completion: second non-flag argument
  if [ "$arg_index" -ge 1 ] && [[ "$cur" != *"@"* || "$cur" == @* ]]; then
    local pkg="${pkg_arg%%@*}"
    local pkg_dir
    pkg_dir=$(_runcollector_find_pkg_dir "$pkg")
    if [ -n "$pkg_dir" ]; then
      local modes
      modes=$(_runcollector_get_modes "$pkg_dir")
      if [ -n "$modes" ]; then
        COMPREPLY=($(compgen -W "$modes" -- "$cur"))
        COMP_WORDBREAKS="$old_wordbreaks"
        return
      fi
    fi
  fi

  # Version completion: package@<TAB>
  if [[ "$cur" == *"@"* ]] && [[ "$cur" != @* ]]; then
    local pkg="${cur%%@*}"
    local pkg_dir
    pkg_dir=$(_runcollector_find_pkg_dir "$pkg")
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

  # Package completion: first argument
  COMPREPLY=($(compgen -W "$(cat "$_RUNCOLLECTOR_CACHE_FILE" 2>/dev/null)" -- "$cur"))
  COMP_WORDBREAKS="$old_wordbreaks"
}

# Build cache on source (<1s with -prune)
_runcollector_build_cache

complete -o nospace -F _runcollector_completions runcollector
complete -o nospace -F _runcollector_completions runcollector-nw
