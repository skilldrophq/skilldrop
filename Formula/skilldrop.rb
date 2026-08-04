class Skilldrop < Formula
  desc "Share and install agent skills with Skilldrop"
  homepage "https://skilldrop.dev"
  url "https://registry.npmjs.org/@skilldrop/cli/-/cli-0.1.0.tgz"
  sha256 "02829a6566cfede64ad4e770d148eacc41de076012c8f61c3baad84d0a11a409"
  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/sk.js" => "sk"
  end

  test do
    assert_match "0.1.0", shell_output("#{bin}/sk --version")
  end
end
