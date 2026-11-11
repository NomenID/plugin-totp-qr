# TOTP QR Code

设置两步验证时，二维码在浏览器里本地画出来，密钥不经过任何第三方服务。

TOTP QR Code 是独立项目，不属于 Nomen 本体，按 Apache-2.0 单独发布：
<https://github.com/NomenID/plugin-totp-qr>。

## 为什么要有它

Nomen 1.3.3 以前，设置页把 `otpauth://` 地址拼成第三方二维码接口的图片地址去加载。
那条地址里带着完整密钥，等于把两步验证的密钥交给了一家外部服务 —— 对方存一份，账号就不设防了。
现在二维码由插件在自己的页面里生成，浏览器全程不联网。

## 工作方式

核心的设置页在需要二维码时调用 `window.NomenQr.render(uri)`，返回 `{ size, path }`，
页面按这个画 `<svg>`。这个全局由插件的 `assets/qr.js` 提供，只在 `/settings` 和
`/recovery/secure` 两个地址登记加载。

插件没启用时拿不到这个全局，设置页显示「无法加载二维码，请手动输入下面的密钥」，
密钥照常显示、照常能录入，功能不受影响。

编码器是插件自带的：字节模式、纠错级别 M、版本 1–10、自动选掩码，够放 `otpauth://` 地址。

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。
