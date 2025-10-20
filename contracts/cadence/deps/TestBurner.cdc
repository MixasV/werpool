access(all) contract Burner {
    access(all) resource interface Burnable {
        access(all) fun burnCallback()
    }
}
