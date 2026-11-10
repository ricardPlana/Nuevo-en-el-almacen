using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wh3d.Api;

public static class Json
{
    // camelCase como en el contrato; tolerante al leer; los campos opcionales a null no se escriben.
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
