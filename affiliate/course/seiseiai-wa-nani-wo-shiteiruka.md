---
title: 生成AIは、実のところ何をしているのか
slug: seiseiai-wa-nani-wo-shiteiruka
minutes: 6
---

最初にここを押さえると、後の章がすべて楽になります。逆にここを飛ばすと、「なぜか思い通りにならない」「なぜか嘘をつく」がずっと不思議なままになります。

## 「調べて答えている」わけではない

多くの人が、生成AIをこう想像しています。

> 質問を受け取る → どこかのデータベースを調べる → 見つけた答えを返す

**実際は違います。** 生成AIがやっているのは、次の1つだけです。

> **これまでの文章の流れから、次に来る可能性が高い言葉を選ぶ。それを繰り返す。**

「日本の首都は」まで来たら、次に「東京」が来る可能性が高い。だから「東京」を出す。その次はどうか、と1語ずつ進んでいきます。

つまり生成AIは、**答えを探しているのではなく、それらしい続きを作っています。**

```svg 探して返す仕組みと、次の語を選び続ける仕組みの違い
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>検索と生成AIの違い</title>
  <defs>
    <marker id="l1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <text x="156" y="24" text-anchor="middle" font-size="14" fill="var(--muted)">多くの人が想像している動き</text>
  <rect x="50" y="38" width="212" height="34" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="156" y="60" text-anchor="middle" font-size="13" fill="var(--fg)">質問する</text>
  <line x1="156" y1="74" x2="156" y2="92" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>
  <rect x="50" y="96" width="212" height="34" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="156" y="118" text-anchor="middle" font-size="13" fill="var(--fg)">どこかを調べる</text>
  <line x1="156" y1="132" x2="156" y2="150" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>
  <rect x="50" y="154" width="212" height="34" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="2"/>
  <text x="156" y="176" text-anchor="middle" font-size="13" fill="var(--fg)">見つけた答えを返す</text>
  <text x="156" y="214" text-anchor="middle" font-size="13" fill="var(--muted)">実際にはこう動いていない</text>

  <line x1="320" y1="30" x2="320" y2="220" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 4"/>

  <text x="484" y="24" text-anchor="middle" font-size="14" fill="var(--accent)">実際の動き</text>
  <rect x="378" y="38" width="212" height="34" rx="6" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>
  <text x="484" y="60" text-anchor="middle" font-size="13" fill="var(--fg)">質問する</text>
  <line x1="484" y1="74" x2="484" y2="92" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>

  <rect x="378" y="96" width="60" height="34" rx="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>
  <text x="408" y="118" text-anchor="middle" font-size="12" fill="var(--fg)">次の語</text>
  <line x1="442" y1="113" x2="458" y2="113" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>
  <rect x="454" y="96" width="60" height="34" rx="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>
  <text x="484" y="118" text-anchor="middle" font-size="12" fill="var(--fg)">次の語</text>
  <line x1="518" y1="113" x2="534" y2="113" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>
  <rect x="530" y="96" width="60" height="34" rx="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>
  <text x="560" y="118" text-anchor="middle" font-size="12" fill="var(--fg)">次の語</text>

  <line x1="484" y1="134" x2="484" y2="150" stroke="var(--muted)" stroke-width="2" marker-end="url(#l1a)"/>
  <rect x="378" y="154" width="212" height="34" rx="6" fill="var(--accent)" stroke="var(--accent)" stroke-width="2"/>
  <text x="484" y="176" text-anchor="middle" font-size="13" fill="#ffffff">文章ができあがる</text>
  <text x="484" y="214" text-anchor="middle" font-size="13" fill="var(--muted)">確かめる工程はどこにもない</text>
</svg>
```

## この一点から、性質のほとんどが説明できる

「次に来そうな言葉を選ぶ装置」だと理解すると、実際に困る場面の理由が、いちいち腑に落ちます。

| よくある出来事 | 理由 |
|---|---|
| 存在しない本や論文を挙げてくる | 本のタイトルとして「ありそうな」語の並びを作れてしまうから |
| 自信満々に間違える | 正しい文と間違った文を、同じやり方で作っているから |
| 聞き方を変えると答えが変わる | 前の文章が変われば、「次に来そうな言葉」も変わるから |
| 長い会話で話がずれる | 直前の流れに引きずられるから |
| 曖昧な指示だと無難な答えになる | 手がかりが少ないと、一般的な言葉ほど選ばれやすいから |

**最後の行が、次の章につながります。** 指示を具体的にすると答えが良くなるのは、AIが賢くなるからではありません。**選ぶ手がかりが増えるから**です。

## 「知らない」と言えない理由

人間なら、知らないことは「知りません」と答えられます。生成AIにそれが難しいのは、**自分が知っているかどうかを確かめる仕組みを持っていないから**です。

質問が来れば、続きを作ります。手持ちの材料が少なくても、それらしい続きは作れてしまいます。**黙るという選択肢が、そもそも構造の中にありません。**

だから「分からなければ分からないと言ってください」と先に伝えておくと、多少ましになります。完全ではありませんが、それを言う許可を与える意味はあります。

## この講座での約束

ここまでを踏まえて、この講座では次の姿勢で進めます。

- **生成AIは道具として非常に有用**です。使わない理由はありません
- ただし**確認は使う側の仕事**です。これは避けられません
- 目指すのは「信じない」ことではなく、**どこを確認すればいいかが分かっている状態**です

次回は、この性質を踏まえて「何を任せてよくて、何を任せてはいけないか」を線引きします。

## 確認問題

```quiz
Q: 生成AIが、実在しない論文のタイトルを挙げてしまうのはなぜですか。
- 学習したデータの中に、その論文が間違って含まれていたから
* 論文名として「ありそうな」語の並びを作れてしまうから | 正解です。生成AIは実在を確認しているのではなく、それらしい続きを作っています。だから「ありそうな名前」は、実在しなくても作れてしまいます。
- 質問の仕方が失礼だったから
- インターネットに接続されていなかったから

Q: 指示を具体的にすると回答の質が上がります。その理由として最も適切なものはどれですか。
- AIが本気を出すようになるから
- 具体的な指示のときだけ、より高性能なAIに切り替わるから
* 次に選ぶ言葉の手がかりが増えるから | 正解です。AIが賢くなるわけではなく、選択の手がかりが増えることで、狙いに近い言葉が選ばれやすくなります。
- 曖昧な指示は無視される仕組みだから

Q: 「分からなければ分からないと答えてください」と先に伝えることについて、正しい説明はどれですか。
- この一文があれば、誤りは完全になくなる
* 多少ましになるが、完全ではない | 正解です。効果はありますが、仕組み上ゼロにはできません。確認する責任は使う側に残ります。
- 意味がないので書くべきではない
- 有料プランでのみ効果がある
```
