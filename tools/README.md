# 测算工具说明

Python 3.10+，只用标准库，不联网、不上传数据。原始私人配置建议放进 `private/` 目录，该目录已加入 Git 忽略规则。

```bash
python tools/retirement.py examples/bridge.json --stress
python tools/retirement.py examples/bridge.json --csv projection.csv
python -m unittest discover -s tests -v
```

## 输入字段

| 字段 | 含义 | 规则 |
|---|---|---|
| name | 情景名称 | 可选字符串 |
| start_age / end_age | 模拟起止年龄 | 整数，起点包含、终点不包含；0至120 |
| assets | 起点可自由支取的资产 | 元，非负；排除自住房和不可取账户 |
| annual_spending | 每年基础支出 | 元，起始购买力；非负 |
| real_return | 税费后实际收益率 | 0.02表示2%，不能低于-1 |
| incomes | 各段税后收入数组 | start_age、end_age、annual_amount，可加label |
| extra_expenses | 阶段额外支出数组 | 同收入字段，叠加在基础支出上 |
| events | 一次性支出数组 | age、amount，可加label；非负支出 |
| return_overrides | 指定年龄年度收益 | 例如 `{"40": -0.2}`，覆盖默认收益 |

数组默认空。各时间段必须完全落在模拟范围内；若缩短模拟期限，应同步截断收入和支出时间段，工具不会静默丢弃。相互重叠的收入和支出将相加。未知字段、非有限数值、负支出或无效年龄会报错退出，避免拼错字段得到假结果。

## 精确定义

年龄40这一行，表示40岁期初至41岁期初。end_age=95时，最后一行为94岁年度，结果为95岁期初资产。

年度先将全年税后收入加入资产并减去全年支出，再将非负余额乘以 `1+实际收益率`。这是“现金流先结算、收益后计算”的简化结算约定，并不总是比其他记账时点保守。年度内先支出后到账的流动性困难无法检测。

若收入加资产不足以支付当年支出，记录未覆盖金额，将可投资余额截为零。工具继续计算后续年度，但**不会假设借款或自动偿还历史缺口**。所以后期资产为正也不能消除早期失败。必须同时查看首次缺口与累计未覆盖金额。恰好花光但没有欠付不算缺口，仍意味着缓冲已耗尽。

CSV只导出基准路径，即使同时用了 `--stress`。字段：age=年龄年度；opening_assets=期初资产；income=收入；expenses=支出；net_draw=支出减收入，可为负；real_return=实际收益；unfunded=未覆盖支出；closing_assets=期末资产。累计缺口未折现，均为同一购买力口径。

## 压力路径

`--stress` 比较三条确定路径：原配置；全部年份零实际收益（清空覆盖）；前两年实际收益-20%与-10%（替换这两年的覆盖，其余年份保留原配置）。这些是说明性的假设，不是投资建议、历史回测或风险概率。

收入中断请删除或分割对应收入段；养老金推迟请修改其起点；一次性支出用events；持续照护用extra_expenses。组合情景另存配置文件，记录改动，便于复查。

## 模型没有做什么

没有逐月结算、税务计算、社保资格认定、名义通胀自动转换、资产类别再平衡、随机模拟、自动调整消费、贷款利息计算、夫妻分别的生存状态或遗产分配。输入的净收入与支出应已反映这些必要费用。不得把输出包装成精确退休年龄、成功率或收益承诺。

计算器只模拟一个综合资金池。受限账户不能直接放进早期assets；需要时可用一个年度收入段录入到期税后可用额，且避免在别处重复计入。固定名义养老金的实际购买力会下降，可拆成不同阶段近似；恒定实际收入假设意味着购买力保持。

## 机器可读输出与文件保护

`python tools/retirement.py examples/bridge.json --stress --json` 将所有所选情景和逐年明细输出到标准输出，JSON模式不会混入状态文本。`schema_version` 为1，金额单位写在 `unit` 中，`minimum_closing_assets` 是整个模拟期的最低年末资产。

可以同时指定 `--csv`；CSV仍只导出基准，导出提示写到标准错误。输出路径不得与输入相同，也不得覆盖已有文件。配置支持UTF-8及带BOM的UTF-8；重复JSON键会明确报错，避免一个资产金额静默覆盖另一个。

## 重建与检查

```bash
python tools/build_cases.py
python tools/build_reader.py
python tools/check_links.py
python -m unittest discover -s tests -v
```

案例表由示例JSON与模型自动生成。修改模型后必须重建，CI会检查提交的案例和阅读版是否与源码一致。
