# Rewriting Git History to Remove Sensitive Data

Use this when a secret, real phone number, API key, or any other sensitive string got committed and pushed to GitHub.

---

## Prerequisites

Install `git-filter-repo` (only needed once):

```bash
pip3 install git-filter-repo
```

---

## Step 1 — Find what needs cleaning

Search all branches and all history for the string:

```bash
git log --all -S "THE_SENSITIVE_STRING" --oneline
```

This shows every commit where the count of that string changed (added or removed). Note the commit SHAs — you'll want to know which branches they live on.

To see which files it's in:

```bash
git log --all -p -S "THE_SENSITIVE_STRING" | grep "diff\|THE_SENSITIVE_STRING"
```

To confirm it's gone from your current working tree:

```bash
grep -r "THE_SENSITIVE_STRING" .
```

---

## Step 2 — Stash uncommitted changes

```bash
git stash push -m "wip before history rewrite"
```

---

## Step 3 — Create a replacements file

```bash
echo 'THE_SENSITIVE_STRING==>THE_SAFE_REPLACEMENT' > /tmp/replacements.txt
```

You can add multiple lines to replace multiple strings at once:

```
real_phone_number==>example_phone_number
real_api_key==>REDACTED
```

The format is `old==>new`. The replacement is applied to file contents inside every commit.

---

## Step 4 — Run git-filter-repo

```bash
git filter-repo --replace-text /tmp/replacements.txt --force
```

This rewrites every commit in your local repo across **all branches**. Commits that contained the sensitive string get new content and new SHAs. All downstream commits get new SHAs too (because a commit's SHA depends on its parent's SHA).

**Note:** `git filter-repo` removes the `origin` remote as a safety measure. That's expected — you re-add it in the next step.

---

## Step 5 — Re-add the remote

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

---

## Step 6 — Verify the rewrite worked

```bash
git log --all -S "THE_SENSITIVE_STRING" --format="%H %s"
```

This should return **nothing**. If it returns commits, the rewrite didn't cover all branches — investigate before pushing.

---

## Step 7 — Identify which branches need force pushing

Any branch that was rewritten locally needs to be force pushed. Compare local vs remote SHAs:

```bash
git show-ref
```

Look for cases where `refs/heads/BRANCH` and `refs/remotes/origin/BRANCH` have different SHAs — those branches need pushing. In practice this is usually all branches that share history with the affected commits.

---

## Step 8 — Force push all affected branches

```bash
git push origin BRANCH_1 --force
git push origin BRANCH_2 --force
# repeat for every branch that was rewritten
```

To push all local branches at once (use carefully):

```bash
git push origin --all --force
```

---

## Step 9 — Restore your stash

```bash
git stash pop
```

If pop fails with a conflict (can happen when filter-repo rewrites the stash base), recover the files manually:

```bash
git checkout stash@{0} -- path/to/file1 path/to/file2
git stash drop
```

---

## Step 10 — Clean up local orphaned objects

```bash
git gc --prune=now
```

This removes the old commit objects from your local repo. After force pushing, those commits are unreachable from any branch, so they're safe to prune.

---

## Step 11 — GitHub cache (optional but thorough)

GitHub caches commit content for a period after force pushes. The old commits are gone from all branch histories, but cached views may still show them briefly.

If the data was genuinely sensitive (credentials, private keys, etc.), contact GitHub Support and ask them to flush the cached data for your repository.

---

## What this does NOT cover

- **Tags:** If you have tags pointing at affected commits, those tags now point at the old (unrewritten) SHAs and will show the old content. Delete and recreate them after the rewrite:

  ```bash
  git tag -d TAG_NAME
  git push origin :refs/tags/TAG_NAME
  git tag TAG_NAME NEW_COMMIT_SHA
  git push origin TAG_NAME
  ```

- **Forks:** If anyone forked your repo before the force push, their fork still has the old history. You cannot clean forks you don't own — contact those users.

- **Pull request diffs:** Closed PRs on GitHub may still show the old diff content. GitHub Support can help with this too.

- **Local clones on other machines:** Anyone who cloned the repo before the force push will have the old commits locally. They need to re-clone or run `git fetch --all` and then reset their branches to the new remote SHAs.
