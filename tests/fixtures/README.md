# Test fixtures

Real-world SGF problem collections from <https://www.u-go.net/classic/> (Ulrich Görtz), used to test
import, validation, normalization and solving. They are kept compressed exactly as distributed.

| File | Contents |
|------|----------|
| `qjzm-a.sgf.gz`, `qjzm-a.zip` | 85 problems from Qi Jing Zhong Miao, with solutions and refutations. FF[3] style: setup in the second node, `PL[1]`/`PL[2]`, wrong answers flagged with `TR` on the move. Same data packed two ways. |
| `xxqj.sgf.gz` | 347 problems from Xuan Xuan Qi Jing, one solution line each (compiled by Jean-Pierre Vesinet). |
| `gzp1.sgf.gz` | 539 problems from Guan Zi Pu volume 1; all share `GN[GZP1]`; one solution line each. |

Known deliberate oddities the tests rely on: one `xxqj` tree retakes a ko immediately (rejected by the
validator), one `gzp1` tree has setup but no moves (rejected), and every file starts with a preamble that
contains parentheses.

**Licensing:** the problem sets are described by their source as being used with the kind permission of the
Flygo website; the uliGo man page calls them "unclearly licensed". They are test data only. Do not republish
this repository publicly with them included without checking.
