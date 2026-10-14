# Contributing

How work gets into `master` on this project.

---

## The problem this prevents

On 20 August, two of us independently wrote the same `ComingSoonPage` component. Neither knew
the other was doing it. Git recorded it as an *add/add* conflict — the signature of two people
solving one problem in parallel.

That was not carelessness. It is what happens when work sits on a branch for two weeks without
touching the trunk. By the time anyone can see what you built, someone else has already built
it.

**One rule does most of the work here: branches should be short.** Everything below serves that.

---

## The flow

```
                  ┌── feat/squad-lineup-picker ──┐
                  │                              │
master ───────────┼── fix/join-code-retrieval ───┼─────────► v1.0-sprint2
 (trunk)          │                              │              (tag)
                  └── chore/gitlab-ci ───────────┘
                       ↑                     ↓
                  branch from           merge request
                  latest master         + 1 approval
```

One trunk. Short branches off it. Merge requests back in. A tag at each sprint boundary.

---

## Rules

### 1. Never commit directly to `master`

Every change arrives through a merge request. Including one-line fixes.

This is enforced, not requested — `master` is protected with *Allowed to push: No one*, so
`git push origin master` fails for everybody. If your push is rejected, that is why. The repo
is not broken.

### 2. Name branches `<type>/<short-description>`

| Type | For | Example |
| --- | --- | --- |
| `feat/` | New functionality | `feat/draft-carousel` |
| `fix/` | Bug fixes | `fix/join-code-retrieval` |
| `chore/` | Tooling, config, dependencies | `chore/gitlab-ci` |
| `docs/` | Documentation only | `docs/data-provider-decision` |

Lowercase, hyphenated, no camelCase. Describe the **change**, not yourself or the page you
happen to be working in.

### 3. A branch lives at most three days

This is the rule that prevents duplicate work. If a task will take longer, split it — a branch
that adds a component and a branch that wires it up are two merge requests, and both are easier
to review than one large one.

If a branch must live longer, pull `master` into it **daily**:

```bash
git fetch origin
git merge origin/master
```

Conflicts resolved daily take minutes. Conflicts resolved after twelve commits take half a day.
We have measured this.

### 4. One merge request per branch, one approval before merge

Enforced: one approval is required, and authors cannot approve their own work. Every merge
request needs another person.

The reviewer is not certifying correctness. Fifteen minutes to answer three questions:

1. Does it build?
2. Do I understand what it does?
3. **Does it collide with anything I know is in flight?**

That third question is the one that catches duplicate work.

Comment threads must be resolved before the merge button unlocks — so raise things in the diff,
not in Discord where they scroll away.

**Write a description that says:** what changed, how you tested it, and anything the reviewer
should look at specifically. Assume the reader was not part of the conversation that led to the
change — a TA or the client may read it.

### 5. Delete the branch after merging

GitLab does this for you; *delete source branch* is on by default. A branch list showing only
work in flight is one people actually read.

### 6. Tag to release — at milestones and every sprint boundary

Merging into `master` deploys to **staging** only. The live site changes when a `v*` tag is
pushed, which runs the production deploy:

```bash
git fetch origin
git tag -a v1.0-sprint2 origin/master -m "Sprint 2 demo state"
git push origin v1.0-sprint2
```

Tag the commit you have checked on staging. Always tag on demo day, before anyone pushes again.
See README → _Deploying_.

### 7. Say what you are starting, in Discord, before you start

One line in the dev channel: *"taking the squad lineup picker, branching now."*

Nothing enforces this. It is the cheapest rule in this document, and the one that would have
prevented the only real coordination failure we have had.

---

## What CI checks

Every merge request runs `.gitlab-ci.yml`:

```bash
npm ci
npm run lint
npm run test       # vitest component and logic tests
npm run build      # tsc -b && vite build
```

Run those two commands locally before pushing and the pipeline will not surprise you.

If a pipeline sits on *pending* rather than running, the job's runner tag no longer matches an
available runner — check `tags:` in `.gitlab-ci.yml` against **Settings → CI/CD → Runners**.

---

## The everyday version

Pin this. It is the whole flow.

```bash
# starting work
git checkout master
git pull
git checkout -b feat/your-thing
# ... say so in Discord ...

# while working — at least daily
git fetch origin && git merge origin/master

# done
npm run lint && npm run build          # what CI will run
git push -u origin feat/your-thing
# open a merge request in GitLab, target master, request a reviewer

# after it merges
git checkout master && git pull
git fetch --prune
git branch -d feat/your-thing
```
