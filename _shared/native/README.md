# Native Shared Layer

供 `*-native` 技能复用的确定性处理器与契约，不属于独立 skill。

- `business_route.py`：从 manifest 生成固定权限、输入范围和降级契约。
- `input_quality.py`：Listing 与选品输入的结构、路径和数值预检。
- `amazon_ad_quality.py`：Amazon 广告文件质量、ASIN 校验与指标计算。
- `native_contracts.py`：evidence、artifact、permission 和安全 ID 的共享校验。
- `contracts/`：manifest、route、quality、evidence 与 artifact schema。

Native saved workflows 位于仓库根的 `.mimocode/workflows/`。本目录不得放入真实 ASIN、持仓、广告报表、密钥或机器绝对路径。
