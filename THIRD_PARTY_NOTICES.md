# 第三方数据与许可

本项目内置了一份《通用规范汉字表》8105 字数据，字段包括拼音、注音、86 版五笔、正体/繁体与部首。

生成与校对使用了以下来源：

## cnchar 及插件（MIT）

- cnchar 3.2.6
- cnchar-trad / cnchar-radical / cnchar-code / cnchar-input

https://github.com/theajack/cnchar

MIT License，版权归 theajack 及贡献者。

## togscc（MIT）

《通用规范汉字表》字表。

https://github.com/jaywcjlove/table-of-general-standard-chinese-characters

MIT License。

## Rime wubi86 词典（LGPL-3.0）

生僻字的 86 五笔编码来自 Rime 的 `wubi86.dict.yaml`。

https://github.com/rime/rime-wubi

GNU Lesser General Public License v3.0。该数据表以 LGPL-3.0 单独分发；本项目其余代码仍为 CC BY-NC-SA 4.0。

## Unihan 数据库（Unicode License）

生僻字的拼音、部首编号与繁体对应来自 Unicode Unihan 数据库。

https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip

UNICODE LICENSE V3，版权归 Unicode, Inc.。

## 生成方式

`packages/dol-mod/src/hanzi-data.ts` 由离线脚本生成：以 togscc 8105 字表为范围，优先用 cnchar 覆盖常用字，生僻字用 Unihan 补拼音/部首/繁体、用 Rime wubi86 补五笔。

如发现个别字数据有误，可直接修改该文件或提交 issue。
