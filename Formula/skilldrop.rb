class Skilldrop < Formula
  desc "Share and install agent skills with Skilldrop"
  homepage "https://skilldrop.dev"
  url "https://registry.npmjs.org/@skilldrop/cli/-/cli-0.1.0.tgz"
  sha256 "c6ff90cb036b55ef7c5e79ff4dbbc85c0d407685105003096bc4ffae71292be2"
  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/sk.js" => "sk"
  end

  test do
    assert_match "0.1.0", shell_output("#{bin}/sk --version")
  end
end
