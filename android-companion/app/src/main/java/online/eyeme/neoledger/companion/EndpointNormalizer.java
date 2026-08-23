package online.eyeme.neoledger.companion;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class EndpointNormalizer {
    private static final String TRANSACTIONS_PATH = "/api/v1/transactions";
    private static final String LEGACY_PATH = "/api/external/quick-sync";

    private EndpointNormalizer() {}

    static String transactionEndpoint(String value) {
        return baseUrl(value) + TRANSACTIONS_PATH;
    }

    static String baseUrl(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("/+$", "");
        if (normalized.endsWith(TRANSACTIONS_PATH)) {
            return normalized.substring(0, normalized.length() - TRANSACTIONS_PATH.length());
        }
        if (normalized.endsWith(LEGACY_PATH)) {
            return normalized.substring(0, normalized.length() - LEGACY_PATH.length());
        }
        return normalized;
    }

    /**
     * Accept public HTTPS endpoints for NAS/website deployments, while keeping
     * HTTP deliberately limited to addresses that are local to the device.
     * This prevents a copied configuration from silently sending a token over
     * plain HTTP on the public Internet.
     */
    static void validateBaseUrl(String value) {
        String normalized = baseUrl(value);
        if (normalized.isEmpty()) throw new IllegalArgumentException("服务地址不能为空");
        final URI uri;
        try {
            uri = new URI(normalized);
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("服务地址格式无效", error);
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!(scheme.equals("http") || scheme.equals("https")) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("服务地址必须是 http 或 https URL，且不能包含账号、查询参数或片段");
        }
        if (scheme.equals("http") && !isLocalHttpHost(uri.getHost())) {
            throw new IllegalArgumentException("公网地址必须使用 HTTPS；HTTP 仅允许 localhost、局域网 IP 或 .local 地址");
        }
    }

    private static boolean isLocalHttpHost(String value) {
        String host = value.toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        if (host.equals("localhost") || host.endsWith(".local")) return true;
        if (host.contains(":")) return isPrivateIpv6(host);
        return isPrivateIpv4(host);
    }

    private static boolean isPrivateIpv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        try {
            for (int index = 0; index < parts.length; index++) {
                if (parts[index].isEmpty() || (parts[index].length() > 1 && parts[index].startsWith("0"))) return false;
                octets[index] = Integer.parseInt(parts[index]);
                if (octets[index] < 0 || octets[index] > 255) return false;
            }
        } catch (NumberFormatException error) {
            return false;
        }
        return octets[0] == 10
                || octets[0] == 127
                || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254);
    }

    private static boolean isPrivateIpv6(String host) {
        String normalized = host.replace("-", ":");
        return normalized.equals("::1")
                || normalized.equals("0:0:0:0:0:0:0:1")
                || normalized.startsWith("fe8")
                || normalized.startsWith("fe9")
                || normalized.startsWith("fea")
                || normalized.startsWith("feb")
                || normalized.startsWith("fc")
                || normalized.startsWith("fd");
    }
}
